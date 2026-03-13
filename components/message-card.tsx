import type { DebateMessage } from "@/types/debate";

export function MessageCard({ message }: { message: DebateMessage }) {
  return (
    <article className={`message${message.role === "user" ? " user" : ""}`}>
      <div className="message-meta">
        <strong>{message.speaker}</strong>
        <span className="message-tag">
          Turn {message.turn} · {message.role}
        </span>
      </div>
      <p className="message-text">{message.content}</p>
    </article>
  );
}
