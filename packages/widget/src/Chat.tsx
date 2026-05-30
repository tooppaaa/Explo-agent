import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { MessageView } from "./MessageView.js";

export interface ChatProps {
  backendUrl: string;
  primary: string;
}

const SUGGESTIONS = [
  "Quels produits génèrent le plus de revenus ?",
  "Donne-moi les ventes par région",
  "Montre-moi un dashboard des KPIs clés",
];

function getToolStatus(messages: UIMessage[], busy: boolean): string | null {
  if (!busy || messages.length === 0) return null;
  const last = messages[messages.length - 1];
  if (last.role !== "assistant") return null;
  type Part = { type: string; toolName?: string; state?: string };
  const parts = ((last as { parts?: Part[] }).parts ?? []);
  const pending = parts.find(
    (p) => (p.type === "tool-execute" || p.type === "tool-call") && p.state !== "output-available",
  );
  if (!pending) return null;
  if (pending.toolName === "search") return "Recherche d'opérations…";
  if (pending.toolName === "execute") return "Exécution du code…";
  return "Traitement…";
}

export function Chat({ backendUrl, primary }: ChatProps) {
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: backendUrl }),
  });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const toolStatus = getToolStatus(messages, busy);

  // Auto-scroll au bottom quand un message est ajouté ou que l'état busy change
  // (et NON à chaque token de streaming, pour ne pas combattre le scroll user).
  useEffect(() => {
    const el = bottomRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, busy]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "42px";
    }
    void sendMessage({ text });
  }, [input, busy, sendMessage]);

  const handleConfirm = useCallback(async (id: string) => {
    const confirmUrl = backendUrl.replace(/\/chat$/, "/confirm");
    try {
      const res = await fetch(confirmUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await res.json() as { ok: boolean; error?: { message?: string }; [key: string]: unknown };
      const statusText = result.ok ? "Opération effectuée." : (result.error?.message ?? "Erreur lors de la confirmation.");
      // Inject a synthetic assistant message rendering the confirmed result.
      const syntheticMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [
          { type: "text", text: statusText, state: "done" } as UIMessage["parts"][number],
          ...(result.ok
            ? [{
                type: "dynamic-tool",
                toolName: "execute",
                toolCallId: crypto.randomUUID(),
                state: "output-available",
                input: {},
                output: result,
              } as UIMessage["parts"][number]]
            : []),
        ],
      };
      setMessages([...messages, syntheticMsg]);
    } catch {
      /* confirm failed silently */
    }
  }, [backendUrl, messages, setMessages]);

  const onAction = useCallback(
    (msg: string) => {
      if (msg.startsWith("__confirm:")) {
        void handleConfirm(msg.slice("__confirm:".length));
      } else {
        void sendMessage({ text: msg });
      }
    },
    [sendMessage, handleConfirm],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "42px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    setInput(el.value);
  };

  return (
    <>
      <div className="cme-messages">
        {messages.length === 0 ? (
          <div className="cme-empty">
            <div className="cme-empty-icon">✨</div>
            <div className="cme-empty-title">Comment puis-je vous aider ?</div>
            <div className="cme-empty-sub">
              Posez une question sur vos données — je recherche, j'exécute et je visualise.
            </div>
            <div className="cme-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="cme-suggestion"
                  onClick={() => { void sendMessage({ text: s }); }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <MessageView key={m.id} message={m} onAction={onAction} />
          ))
        )}

        {/* Typing / tool status indicator */}
        {busy && (
          <div className="cme-typing" role="status" aria-live="polite">
            <div className="cme-avatar">🤖</div>
            <div className="cme-assistant-content">
              {toolStatus ? (
                <div className="cme-tool-status">
                  <div className="cme-spinner" />
                  {toolStatus}
                </div>
              ) : (
                <div className="cme-typing-bubble" aria-label="Le modèle réfléchit">
                  <div className="cme-dot" />
                  <div className="cme-dot" />
                  <div className="cme-dot" />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="cme-input-area">
        <div className="cme-input-row">
          <textarea
            ref={textareaRef}
            className="cme-input"
            value={input}
            placeholder="Posez votre question…"
            rows={1}
            onInput={handleInput}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
          />
          <button
            className="cme-send"
            onClick={handleSubmit}
            disabled={busy || !input.trim()}
            style={{ background: primary }}
            aria-label="Envoyer"
          >
            ↑
          </button>
        </div>
        <div className="cme-input-hint">Entrée pour envoyer · Maj+Entrée pour sauter une ligne</div>
      </div>
    </>
  );
}
