import { Band } from "@/components/Band";
import { Explorer } from "@/components/Explorer";
import { Hero } from "@/components/Hero";
import { Nav } from "@/components/Nav";
import { BuiltOn, Footer, How, Limits, Proofs } from "@/components/Sections";
import { Toast } from "@/components/Toast";
import { Vaults } from "@/components/Vaults";

export default function Home() {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Nav />
      <main id="main" className="wrap">
        <Hero />
        <BuiltOn />
        <How />
        <Explorer />
        <Vaults />
        <Limits />
        <Proofs />
        <Band />
        <Footer />
      </main>
      <Toast />
    </>
  );
}
