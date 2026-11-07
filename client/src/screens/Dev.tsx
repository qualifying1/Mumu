import { Link } from "react-router";
import Placeholder from "../components/Placeholder.tsx";

export default function Dev() {
  return (
    <Placeholder title="Dev">
      <ul className="mt-4 list-disc pl-6">
        <li>
          <Link to="/dev/mumu" className="underline">
            MumuLab
          </Link>
        </li>
        <li>Fixture loader (B2)</li>
      </ul>
    </Placeholder>
  );
}
