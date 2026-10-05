using Microsoft.Data.Sqlite;

namespace Lanternfall.Server;

// The log of dives, kept in one SQLite file next to the app. Writes go through a single lock:
// the traffic is small, and it keeps SQLite out of "database is locked" territory.
public sealed class Db
{
    readonly string connectionString;
    public readonly SemaphoreSlim WriteLock = new(1, 1);

    public Db(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        connectionString = new SqliteConnectionStringBuilder { DataSource = path, Pooling = true }.ToString();
        using var c = Open();
        Exec(c, """
            pragma journal_mode = wal;
            create table if not exists players (
              id          text    primary key,
              token_hash  text    not null,
              name        text,
              name_key    text    unique,
              created_at  integer not null
            );
            create table if not exists dives (
              id          text    primary key,
              player_id   text    not null references players(id),
              started_at  integer not null,
              finished_at integer,
              score       integer,
              depth       integer,
              kills       integer,
              species     integer,
              duration_s  integer
            );
            create index if not exists dives_player_idx on dives (player_id, started_at desc);
            create index if not exists dives_score_idx  on dives (score desc) where finished_at is not null;
            """);
    }

    public SqliteConnection Open()
    {
        var c = new SqliteConnection(connectionString);
        c.Open();
        Exec(c, "pragma busy_timeout = 5000; pragma foreign_keys = on;");
        return c;
    }

    public static int Exec(SqliteConnection c, string sql, params (string, object?)[] args)
        => Cmd(c, sql, args).ExecuteNonQuery();

    public static object? Scalar(SqliteConnection c, string sql, params (string, object?)[] args)
        => Cmd(c, sql, args).ExecuteScalar();

    public static SqliteDataReader Query(SqliteConnection c, string sql, params (string, object?)[] args)
        => Cmd(c, sql, args).ExecuteReader();

    static SqliteCommand Cmd(SqliteConnection c, string sql, (string, object?)[] args)
    {
        var cmd = c.CreateCommand();
        cmd.CommandText = sql;
        foreach (var (k, v) in args) cmd.Parameters.AddWithValue(k, v ?? DBNull.Value);
        return cmd;
    }

    public static long Now() => DateTimeOffset.UtcNow.ToUnixTimeSeconds();
}
