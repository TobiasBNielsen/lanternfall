using Microsoft.Data.Sqlite;

namespace Lanternfall.Server;

public record BoardRow(long Rank, string Name, long Score, long Depth);

// The board ranks divers, not dives: each named diver's best dive, highest score first,
// and the earlier dive first when two scores are equal.
public static class Board
{
    const string Ranked = """
        with best as (
          select p.id, p.name, d.score, d.depth, d.finished_at,
                 row_number() over (partition by p.id order by d.score desc, d.finished_at asc) as rn
          from dives d join players p on p.id = d.player_id
          where d.finished_at is not null and p.name is not null
        ),
        ranked as (
          select id, name, score, depth,
                 row_number() over (order by score desc, finished_at asc) as rank
          from best where rn = 1
        )
        """;

    public static List<BoardRow> Top(SqliteConnection c, int limit)
    {
        var rows = new List<BoardRow>();
        using var r = Db.Query(c, Ranked + "select rank, name, score, depth from ranked where rank <= @n order by rank", ("@n", limit));
        while (r.Read()) rows.Add(Read(r));
        return rows;
    }

    // This diver's place, or null while they have no name or no finished dive.
    public static BoardRow? Row(SqliteConnection c, string playerId)
    {
        using var r = Db.Query(c, Ranked + "select rank, name, score, depth from ranked where id = @id", ("@id", playerId));
        return r.Read() ? Read(r) : null;
    }

    public static long Count(SqliteConnection c) => (long)Db.Scalar(c, """
        select count(distinct d.player_id) from dives d join players p on p.id = d.player_id
        where d.finished_at is not null and p.name is not null
        """)!;

    static BoardRow Read(SqliteDataReader r) => new(r.GetInt64(0), r.GetString(1), r.GetInt64(2), r.GetInt64(3));
}
