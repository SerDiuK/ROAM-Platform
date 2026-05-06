import { z } from "zod";

export const CoordSchema = z.object({
	lat: z.number(),
	lon: z.number(),
});
export type Coord = z.infer<typeof CoordSchema>;
