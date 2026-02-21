import Chat from "@/components/Chat";

export const metadata = {
  title: "Plan a Project — MakerLab Tools",
  description:
    "Describe what you want to build and get a step-by-step plan using MakerLab tools.",
};

export default function PlanPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="h-[calc(100vh-150px)] rounded-xl border border-card-border bg-card-bg overflow-hidden flex flex-col">
        <Chat
          mode="planner"
          header="Project Planner"
          suggestions={[
            "I want to build something",
            "Help me pick a material",
            "What can I make here?",
            "I have a class project idea",
          ]}
        />
      </div>
    </div>
  );
}
