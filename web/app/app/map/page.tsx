import { redirect } from "next/navigation";

// The map is now part of the single app page. Old links to /app/map land there.
export default function MapPage() {
  redirect("/app");
}
