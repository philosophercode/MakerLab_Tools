import type { ToolWithMeta } from "@/lib/types";
import ToolCard from "./ToolCard";

export default function ToolGrid({ tools }: { tools: ToolWithMeta[] }) {
  if (tools.length === 0) {
    return (
      <div className="py-20 text-center text-muted">
        <p className="text-lg">No tools found</p>
        <p className="mt-1 text-sm">Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tools.map((tool) => (
        <ToolCard key={tool.id} tool={tool} />
      ))}
    </div>
  );
}
