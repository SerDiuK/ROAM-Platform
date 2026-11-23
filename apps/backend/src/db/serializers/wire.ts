import type { z } from "zod";

// The JSON round trip turns ObjectIds and Dates into the strings the wire schemas parse.
export function toWire<Schema extends z.ZodTypeAny>(
	schema: Schema,
	doc: unknown,
): z.output<Schema> {
	return schema.parse(JSON.parse(JSON.stringify(doc)));
}
