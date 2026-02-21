import Chat from "@/components/Chat";

export const metadata = {
  title: "Chat — MakerLab Tools",
  description: "Ask questions about Cornell MakerLab tools and equipment.",
};

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="h-[calc(100vh-150px)] rounded-xl border border-card-border bg-card-bg overflow-hidden flex flex-col">
        <Chat
          header="MakerLab Assistant"
          suggestions={[
            "What can cut acrylic?",
            "Which 3D printers are available?",
            "I want to build something",
            "I have a class project idea",
          ]}
        />
      </div>
    </div>
  );
}
