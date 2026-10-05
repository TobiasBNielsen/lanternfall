using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;
using Lanternfall.Server;
using Microsoft.AspNetCore.RateLimiting;

// Published, the game sits in wwwroot next to the app. In development it is read straight from ../web.
var contentRoot = AppContext.BaseDirectory;
var webRoot = Path.Combine(contentRoot, "wwwroot");
if (!Directory.Exists(webRoot)) webRoot = FindDevWebRoot(Directory.GetCurrentDirectory());

var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, ContentRootPath = contentRoot, WebRootPath = webRoot });
builder.Services.AddSingleton(new Db(Path.Combine(contentRoot, "App_Data", "lanternfall.db")));
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    // a generous ceiling per address for the whole API, and a tight one for making new divers
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        ctx.Request.Path.StartsWithSegments("/api")
            ? RateLimitPartition.GetFixedWindowLimiter(Ip(ctx), _ => new() { PermitLimit = 90, Window = TimeSpan.FromMinutes(1) })
            : RateLimitPartition.GetNoLimiter(""));
    o.AddPolicy("new-player", ctx => RateLimitPartition.GetFixedWindowLimiter(Ip(ctx), _ => new() { PermitLimit = 20, Window = TimeSpan.FromHours(1) }));
    o.OnRejected = (ctx, _) => RefuseAsync(ctx.HttpContext, 429, "The ship is busy. Try again in a minute.");
});

var app = builder.Build();
app.UseRateLimiter();
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    // the game has no build step, so make browsers check for a newer file instead of trusting an old one
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache",
});

var api = app.MapGroup("/api");

// A new diver: an id that is shown to others never, and a secret that only this browser keeps.
api.MapPost("/players", (Db db) =>
{
    var id = Guid.NewGuid().ToString("N");
    var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    using var c = db.Open();
    Db.Exec(c, "insert into players (id, token_hash, created_at) values (@id, @h, @t)", ("@id", id), ("@h", Hash(token)), ("@t", Db.Now()));
    return Results.Ok(new { id, token });
}).RequireRateLimiting("new-player");

api.MapGet("/me", (HttpContext ctx, Db db) =>
{
    using var c = db.Open();
    var me = Authenticate(ctx, c);
    if (me is null) return Unauthorized();
    return Results.Ok(new { name = me.Name, best = Board.Row(c, me.Id) });
});

api.MapPut("/me/name", async (HttpContext ctx, Db db, NameRequest req) =>
{
    var name = Regex.Replace(req.Name ?? "", @"\s+", " ").Trim();
    if (name.Length is < 1 or > 16) return Refuse(400, "The name has to be between 1 and 16 characters.");
    if (name.Any(char.IsControl)) return Refuse(400, "That name has characters the log cannot hold.");
    var key = name.ToLowerInvariant();

    await db.WriteLock.WaitAsync();
    try
    {
        using var c = db.Open();
        var me = Authenticate(ctx, c);
        if (me is null) return Unauthorized();
        var owner = Db.Scalar(c, "select id from players where name_key = @k", ("@k", key)) as string;
        if (owner is not null && owner != me.Id) return Refuse(409, "Someone else signs the log as that. Pick another name.");
        Db.Exec(c, "update players set name = @n, name_key = @k where id = @id", ("@n", name), ("@k", key), ("@id", me.Id));
        return Results.Ok(new { name, best = Board.Row(c, me.Id) });
    }
    finally { db.WriteLock.Release(); }
});

// A dive is opened on the server when the sphere goes down, so its length can be checked against the clock.
api.MapPost("/dives", async (HttpContext ctx, Db db) =>
{
    await db.WriteLock.WaitAsync();
    try
    {
        using var c = db.Open();
        var me = Authenticate(ctx, c);
        if (me is null) return Unauthorized();
        var recent = (long)Db.Scalar(c, "select count(*) from dives where player_id = @p and started_at > @t", ("@p", me.Id), ("@t", Db.Now() - 60))!;
        if (recent >= 10) return Refuse(429, "Give the ship a moment before going down again.");
        var id = Guid.NewGuid().ToString("N");
        Db.Exec(c, "insert into dives (id, player_id, started_at) values (@id, @p, @t)", ("@id", id), ("@p", me.Id), ("@t", Db.Now()));
        return Results.Ok(new { id });
    }
    finally { db.WriteLock.Release(); }
});

api.MapPost("/dives/{id}/finish", async (string id, HttpContext ctx, Db db, FinishRequest d) =>
{
    await db.WriteLock.WaitAsync();
    try
    {
        using var c = db.Open();
        var me = Authenticate(ctx, c);
        if (me is null) return Unauthorized();

        long startedAt;
        using (var r = Db.Query(c, "select started_at, finished_at from dives where id = @id and player_id = @p", ("@id", id), ("@p", me.Id)))
        {
            if (!r.Read()) return Refuse(404, "The ship has no record of that dive.");
            if (!r.IsDBNull(1)) return Refuse(409, "That dive is already in the log.");
            startedAt = r.GetInt64(0);
        }

        var problem = Rules.Check(d, elapsed: Db.Now() - startedAt);
        if (problem is not null) return Refuse(400, problem);

        var before = Board.Row(c, me.Id);
        Db.Exec(c, """
            update dives set finished_at = @f, score = @s, depth = @d, kills = @k, species = @sp, duration_s = @du
            where id = @id
            """, ("@f", Db.Now()), ("@s", d.Score), ("@d", d.Depth), ("@k", d.Kills), ("@sp", d.Species), ("@du", d.Duration), ("@id", id));
        var after = Board.Row(c, me.Id);
        return Results.Ok(new
        {
            name = me.Name,
            personalBest = before is null || d.Score > before.Score,
            best = after,
        });
    }
    finally { db.WriteLock.Release(); }
});

api.MapGet("/board", (HttpContext ctx, Db db, int? limit) =>
{
    using var c = db.Open();
    var me = Authenticate(ctx, c);
    var n = Math.Clamp(limit ?? 10, 1, 50);
    var top = Board.Top(c, n);
    var mine = me is null ? null : Board.Row(c, me.Id);
    return Results.Ok(new
    {
        top = top.Select(r => new { r.Rank, r.Name, r.Score, r.Depth, me = me is not null && r.Rank == mine?.Rank }),
        me = mine is not null && mine.Rank > n ? mine : null,
        divers = Board.Count(c),
    });
});

api.MapFallback(() => Refuse(404, "The ship does not know that signal."));

app.Run();

// Walk up from where `dotnet run` was started until the repository's web folder turns up.
static string FindDevWebRoot(string from)
{
    for (var dir = new DirectoryInfo(from); dir is not null; dir = dir.Parent)
    {
        var web = Path.Combine(dir.FullName, "web");
        if (File.Exists(Path.Combine(web, "index.html"))) return web;
    }
    throw new DirectoryNotFoundException("Could not find the game's web folder.");
}

static string Ip(HttpContext ctx) => ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";

static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

// The browser sends "Bearer <player id>.<secret>".
static Player? Authenticate(HttpContext ctx, Microsoft.Data.Sqlite.SqliteConnection c)
{
    var auth = ctx.Request.Headers.Authorization.ToString();
    if (!auth.StartsWith("Bearer ")) return null;
    var parts = auth["Bearer ".Length..].Split('.');
    if (parts.Length != 2) return null;
    using var r = Db.Query(c, "select token_hash, name from players where id = @id", ("@id", parts[0]));
    if (!r.Read()) return null;
    var expected = Convert.FromHexString(r.GetString(0));
    var given = SHA256.HashData(Encoding.UTF8.GetBytes(parts[1]));
    if (!CryptographicOperations.FixedTimeEquals(expected, given)) return null;
    return new Player(parts[0], r.IsDBNull(1) ? null : r.GetString(1));
}

// Only these plain-language refusals reach the player; the game shows the message as it is.
static IResult Refuse(int status, string message) => Results.Json(new { message }, statusCode: status);
static IResult Unauthorized() => Refuse(401, "The ship does not recognise this sphere.");
static ValueTask RefuseAsync(HttpContext ctx, int status, string message)
{
    ctx.Response.StatusCode = status;
    return new ValueTask(ctx.Response.WriteAsJsonAsync(new { message }));
}

record Player(string Id, string? Name);
record NameRequest(string? Name);
