namespace Lanternfall.Server;

public record FinishRequest(int Score, int Depth, int Kills, int Species, int Duration);

// What a finished dive has to look like to go in the log. Every wave is 120 meters. The limits are
// generous on purpose: they only catch numbers the game cannot produce, not good players.
public static class Rules
{
    public const int MetersPerWave = 120;

    public static string? Check(FinishRequest d, long elapsed)
    {
        if (d.Depth < MetersPerWave || d.Depth % MetersPerWave != 0 || d.Depth > 120_000)
            return "That depth is not one the game can reach.";
        long waves = d.Depth / MetersPerWave;

        if (d.Duration < waves * 8)
            return "That dive was faster than the water allows.";
        // the game only counts time spent diving, so it can never be longer than the clock on the ship
        if (d.Duration > elapsed + 10)
            return "That dive took longer than the ship has been waiting.";
        if (elapsed > 12 * 3600)
            return "That dive is too old to sign for now.";
        if (d.Score <= 0)
            return "There is nothing to sign for yet.";
        if (d.Score > waves * 20_000 + waves * waves * 600 + 50_000)
            return "That score does not fit the depth.";
        if (d.Kills < 0 || d.Kills > waves * 90 + 20)
            return "Too many creatures for that depth.";
        if (d.Species is < 0 or > 20)
            return "Unknown number of species.";
        return null;
    }
}
