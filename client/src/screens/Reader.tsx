import { useParams } from "react-router";
import Placeholder from "../components/Placeholder.tsx";

export default function Reader() {
  const { chapterId } = useParams();
  return <Placeholder title={`Reader: ${chapterId ?? "?"}`} />;
}
