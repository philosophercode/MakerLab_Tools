import { notFound } from "next/navigation";
import {
  fetchTool,
  fetchAllCategories,
  fetchAllLocations,
  fetchUnitsByTool,
  resolveTools,
} from "@/lib/airtable";
import ImageGallery from "@/components/ImageGallery";
import SafetyBadges from "@/components/SafetyBadges";
import DocLinks from "@/components/DocLinks";
import UnitStatusTable from "@/components/UnitStatusTable";
import Chat from "@/components/Chat";

export const revalidate = 300;

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let tool;
  try {
    const [toolRecord, categories, locations] = await Promise.all([
      fetchTool(id),
      fetchAllCategories(),
      fetchAllLocations(),
    ]);
    const resolved = resolveTools([toolRecord], categories, locations);
    tool = resolved[0];
  } catch {
    notFound();
  }

  if (!tool) notFound();

  // Fetch units separately (may fail independently)
  let units: Awaited<ReturnType<typeof fetchUnitsByTool>> = [];
  try {
    units = await fetchUnitsByTool(id);
  } catch {
    // Units are optional — continue without them
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted">
        <a href="/" className="hover:text-foreground">
          Tools
        </a>
        <span className="mx-2">/</span>
        <span className="text-foreground">{tool.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left column: Info */}
        <div className="space-y-6">
          {/* Image */}
          <ImageGallery
            images={tool.image_attachments}
            toolName={tool.name}
          />

          {/* Name + description */}
          <div>
            <h1 className="text-2xl font-bold">{tool.name}</h1>
            <p className="mt-2 text-muted leading-relaxed">
              {tool.description}
            </p>
          </div>

          {/* Safety */}
          <SafetyBadges
            ppe_required={tool.ppe_required}
            training_required={tool.training_required}
            authorized_only={tool.authorized_only}
          />

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-medium text-muted">Category</h3>
              <p className="mt-0.5 text-sm">
                {tool.category_group} — {tool.category_sub}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-medium text-muted">Location</h3>
              <p className="mt-0.5 text-sm">
                {tool.location_room} — {tool.location_zone}
              </p>
            </div>
          </div>

          {/* Materials */}
          {tool.materials.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted mb-1.5">
                Compatible Materials
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {tool.materials.map((m) => (
                  <span
                    key={m}
                    className="rounded-full bg-muted-bg px-2.5 py-0.5 text-xs"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Use restrictions */}
          {tool.use_restrictions && (
            <div>
              <h3 className="text-xs font-medium text-muted mb-1">
                Use Restrictions
              </h3>
              <p className="text-sm text-muted leading-relaxed">
                {tool.use_restrictions}
              </p>
            </div>
          )}

          {/* Emergency stop */}
          {tool.emergency_stop && (
            <div className="rounded-lg border border-danger/20 bg-danger/5 p-3">
              <h3 className="text-xs font-semibold text-danger mb-1">
                Emergency Stop
              </h3>
              <p className="text-sm">{tool.emergency_stop}</p>
            </div>
          )}

          {/* Documentation links */}
          <DocLinks
            safety_doc_url={tool.safety_doc_url}
            sop_url={tool.sop_url}
            video_url={tool.video_url}
          />

          {/* Manual downloads */}
          {tool.manual_attachments.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted mb-2">Manuals</h3>
              <div className="space-y-1.5">
                {tool.manual_attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-card-border px-3 py-2 text-sm hover:bg-muted-bg transition-colors"
                  >
                    <span>📄</span>
                    <span className="truncate">{a.filename}</span>
                    <span className="ml-auto text-xs text-muted">
                      {(a.size / 1024).toFixed(0)} KB
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Units table */}
          <UnitStatusTable units={units} />
        </div>

        {/* Right column: Chat */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="h-[600px] rounded-xl border border-card-border bg-card-bg overflow-hidden flex flex-col">
            <div className="border-b border-card-border px-4 py-3">
              <h2 className="font-semibold text-sm">Ask about {tool.name}</h2>
            </div>
            <Chat
              toolId={id}
              suggestions={[
                "How do I get started?",
                "Safety precautions?",
                "What materials can I use?",
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
