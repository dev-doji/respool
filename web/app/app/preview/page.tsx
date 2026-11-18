import { notFound } from "next/navigation";
import { PreviewStates } from "@/components/PreviewStates";

// Development only: renders every state of the vault card with fake data so the UI can be reviewed without a
// wallet. In a production build this route is a 404.
export default function PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="wrap" style={{ padding: "32px 20px 80px" }}>
      <p className="cap">development preview, fake data, not shipped</p>
      <h1 style={{ fontSize: "clamp(36px,6vw,64px)", margin: "8px 0 28px" }}>Vault states</h1>
      <PreviewStates />
    </div>
  );
}
