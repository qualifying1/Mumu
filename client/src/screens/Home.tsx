import Placeholder from "../components/Placeholder.tsx";

export default function Home() {
  return (
    <Placeholder title="Search">
      <div data-mumu-ledge className="mt-6 h-3 border-b-4 border-current" aria-label="shelf plank" />
      <div data-mumu-floor className="mt-32 h-4 border-t-4 border-current" aria-label="desk top" />
    </Placeholder>
  );
}
