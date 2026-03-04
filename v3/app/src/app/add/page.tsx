import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Add Equipment — MakerLab Tools",
  description: "Add a new tool or unit to the MakerLab inventory.",
};

export default function AddPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Add Equipment</h1>
        <p className="mt-1 text-sm text-muted">
          Use the forms below to add new tools and units to the inventory.
        </p>
      </div>

      {/* Step 1: Add New Tool */}
      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cornell-red text-white text-sm font-bold mr-2">
              1
            </span>
            Add New Tool
          </h2>
          <p className="mt-1 ml-9 text-sm text-muted">
            Register a new tool or piece of equipment in the catalog.
          </p>
        </div>
        <div className="rounded-xl border border-card-border bg-card-bg overflow-hidden">
          <iframe
            className="airtable-embed"
            src="https://airtable.com/embed/appQv9Q4jm4UzLpFK/pagbHbuIbCXbNNIIs/form"
            frameBorder="0"
            width="100%"
            height="533"
            style={{ background: "transparent" }}
            title="Add New Tool form"
          />
        </div>
      </section>

      {/* Step 2: Add Unit */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cornell-red text-white text-sm font-bold mr-2">
              2
            </span>
            Add Unit
          </h2>
          <p className="mt-1 ml-9 text-sm text-muted">
            Add a specific physical unit for an existing tool (e.g. "Prusa #3").
          </p>
        </div>
        <div className="rounded-xl border border-card-border bg-card-bg overflow-hidden">
          <iframe
            className="airtable-embed"
            src="https://airtable.com/embed/appQv9Q4jm4UzLpFK/pagf6zQUpOAjb9yyl/form"
            frameBorder="0"
            width="100%"
            height="533"
            style={{ background: "transparent" }}
            title="Add Unit form"
          />
        </div>
      </section>
    </div>
  );
}
