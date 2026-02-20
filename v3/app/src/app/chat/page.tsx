import Chat from "@/components/Chat";

export const metadata = {
  title: "Chat — MakerLab Tools",
  description: "Ask questions about Cornell MakerLab tools and equipment.",
};

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">MakerLab Assistant</h1>
        <p className="mt-1 text-sm text-muted">
          Ask about any tool, material, or process in the MakerLab.
        </p>
      </div>
      <div className="h-[calc(100vh-220px)] rounded-xl border border-card-border bg-card-bg overflow-hidden flex flex-col">
        <Chat
          suggestions={[
            "What can cut acrylic?",
            "Which 3D printers are available?",
            "What PPE do I need for the laser cutter?",
            "How do I get started with electronics?",
          ]}
        />
      </div>
    </div>
  );
}
