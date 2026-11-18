"use client";
import { toast } from "@/lib/toast";
import { Comb } from "./Comb";
import { Reveal } from "./Reveal";

const COMMANDS = [
  "git clone https://github.com/dev-doji/respool.git",
  "cd respool",
  "git submodule update --init",
  "git -C lib/v4-core submodule update --init lib/solmate",
  "forge test",
  "node observer/observe.mjs summary",
];

const Prompt = () => <span className="p">$ </span>;

export function Band() {
  const copy = async () => {
    try { await navigator.clipboard.writeText(COMMANDS.join("\n")); toast("Commands copied"); }
    catch { toast("Select the text and copy it"); }
  };
  return (
    <Reveal as="section" className="band" aria-labelledby="run-h">
      <Comb seed={5} className="band-comb comb" />
      <h2 id="run-h">Run it <span>yourself.</span></h2>
      <pre className="code" tabIndex={0} aria-label="Setup commands">
        <button className="pbtn small copy" type="button" onClick={copy}>Copy</button>
        <span className="c"># needs Foundry and Node 18+</span>{"\n"}
        <Prompt />{COMMANDS[0]}{"\n"}
        <Prompt />{COMMANDS[1]}{"\n"}
        <Prompt />{COMMANDS[2]}{"\n"}
        <Prompt />{COMMANDS[3]}{"\n"}
        <Prompt />{COMMANDS[4]}{"         "}<span className="c"># 57 tests</span>{"\n"}
        <Prompt />{COMMANDS[5]}
      </pre>
    </Reveal>
  );
}
