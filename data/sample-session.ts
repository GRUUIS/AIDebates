import { defaultAgents } from "@/data/agents";
import type { DebateSession } from "@/types/debate";

export const sampleSession: DebateSession = {
  topic: "Should governments permit AI systems to make life-and-death decisions in battlefield settings?",
  framing:
    "The debate centers on whether delegating lethal decisions to autonomous systems can ever be morally justified once military necessity, civilian risk, accountability, and long-term norms are weighed together.",
  agents: defaultAgents,
  messages: [
    {
      id: "m1",
      speakerId: "moderator",
      speaker: "Avery",
      role: "moderator",
      turn: 1,
      content:
        "We are discussing autonomous weapons. Each speaker should address one core question first: can moral accountability survive when a machine, rather than a human, decides to kill?"
    },
    {
      id: "m2",
      speakerId: "utilitarian",
      speaker: "Mira",
      role: "debater",
      turn: 2,
      content:
        "If a system could reliably reduce civilian casualties compared with human soldiers, a total ban would ignore real preventable harm. The ethical burden is comparative: what decision process causes fewer wrongful deaths overall?"
    },
    {
      id: "m3",
      speakerId: "deontologist",
      speaker: "Jonah",
      role: "debater",
      turn: 3,
      content:
        "A machine cannot bear duty, guilt, or respect. Delegating the final decision to kill treats persons as targets to be processed rather than as beings owed moral recognition by another moral agent."
    },
    {
      id: "m4",
      speakerId: "user",
      speaker: "You",
      role: "user",
      turn: 4,
      content:
        "What if the human commander still authorizes the mission but the model only handles last-second targeting faster than a person could?"
    }
  ],
  evidence: []
};

