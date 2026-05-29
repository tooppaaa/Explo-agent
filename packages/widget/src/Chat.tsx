import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageView } from "./MessageView.js";

export interface ChatProps {
  backendUrl: string;
  primary: string;
}

export function Chat({ backendUrl, primary }: ChatProps) {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: backendUrl }),
  });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  };

  return (
    <>
      <div className="cme-messages">
        {messages.length === 0 && (
          <div className="cme-msg cme-msg-assistant">
            <div className="cme-text">
              Pose une question sur les données (ex. « ventes par région »).
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageView key={m.id} message={m} />
        ))}
      </div>
      {busy && <div className="cme-status">…le modèle réfléchit</div>}
      <form className="cme-input-row" onSubmit={submit}>
        <input
          className="cme-input"
          value={input}
          placeholder="Votre message…"
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          className="cme-send"
          type="submit"
          disabled={busy}
          style={{ background: primary }}
        >
          Envoyer
        </button>
      </form>
    </>
  );
}
