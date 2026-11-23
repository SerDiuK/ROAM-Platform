import { makeTable } from "@oclif/table";
import { expect, it } from "vitest";

it("renders a table with @oclif/table's own React", () => {
	const table = makeTable({
		data: [{ callsign: "MEDIC-1" }],
		columns: ["callsign"],
	});

	expect(table).toContain("MEDIC-1");
});
