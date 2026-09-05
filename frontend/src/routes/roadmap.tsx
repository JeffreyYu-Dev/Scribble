import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/roadmap")({
  head: () => ({ meta: [{ title: "scribble - roadmap" }] }),
  component: Roadmap,
});

function Roadmap() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-sm">
      <h1 className="text-lg font-semibold">Stuff to todo ig</h1>

      <Section title="Top priority">
        <li>sound</li>
        <li>custom game configuration not implemented</li>
      </Section>

      <Section title="Medium priority">
        <li>bigger word pool</li>
        <li>events displayed in chat</li>
        <li>better effects and visual improvement</li>
        <li>keybinds</li>
        <li>
          fix header growing and shrinking based on if the player is drawing or
          guessing
        </li>
      </Section>

      <Section title="Low priority">
        <li>redo scoring logic</li>
        <li>update home page ui, join is unintuitive?</li>
        <li>room game selection state doesn't work like it should</li>
        <li>update guessing game leaderboard animation and ui</li>
        <li>emoji picker</li>
      </Section>

      <Section title="Stuff lol">
        <li>smooth out timer</li>
        <li>members should be able to see settings</li>
        <li>user settings</li>
        <li>ui overhaul</li>
        <li>mute</li>
        <li>vote kick</li>
        <li>room and player session</li>
        <li>reconnection logic</li>
        <li>create tool registry for ease of adding new tools</li>
        <li>vote on game/poll</li>
        <li>word requests</li>
        <li>slay the spire card selection ui?</li>
        <li>btd battles inspired</li>
        <li>timeline/logging (like who joined, what games were played)</li>
        <li>tournament</li>
        <li>player accounts</li>
        <li>avatar builder</li>
        <li>animate between pages</li>
        <li>sabotage powers?</li>
        <li>post round/gallery (or save it to the room session?)</li>
        <li>comp</li>
        <li>public</li>
      </Section>

      <Section title="Game ideas?">
        <li>co-op drawing</li>
        <li>power ups</li>
        <li>point stealing (not really sure)</li>
        <li>imposter</li>
        <li>telephone</li>
        <li>animation</li>
        <li>blind draw</li>
      </Section>

      <p className="text-muted-foreground mt-8">
        I have many more ideas these are just a few
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">{children}</ul>
    </section>
  );
}
