import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Sparkles,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Database,
  Table2,
  MessageCircle,
  Bot,
  User,
  Copy,
  Check,
} from "lucide-react";

type GenieResult = {
  conversation_id: string;
  message_id: string;
  status: string;
  text: string;
  sql: string | null;
  suggested_questions: string[];
  query_result: {
    columns: string[];
    rows: unknown[][];
    row_count: number;
  } | null;
};

type ChatTurn = {
  question: string;
  result: GenieResult;
};

export const Route = createFileRoute("/_sidebar/genie")({
  component: () => <GeniePage />,
});

const SAMPLE_QUESTIONS = [
  {
    text: "Which robots are most likely to need maintenance in the next 30 days?",
    icon: Bot,
  },
  {
    text: "What are the top risk drivers across the fleet right now?",
    icon: Sparkles,
  },
  {
    text: "Which components have the highest ML maintenance risk?",
    icon: Database,
  },
] as const;

function cleanGenieText(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/^- /gm, "\u2022 ")
    .trim();
}

function GeniePage() {
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, loading]);

  const orderedChat = useMemo(() => [...chat].reverse(), [chat]);

  const askGenie = async (questionOverride?: string) => {
    const trimmed = (questionOverride ?? question).trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setPendingQuestion(trimmed);
    setQuestion("");
    try {
      const response = await fetch("/api/genie/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          conversation_id: conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Genie request failed (${response.status})`);
      }

      const result = (await response.json()) as GenieResult;
      setConversationId(result.conversation_id);
      setChat((prev) => [{ question: trimmed, result }, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setPendingQuestion(null);
    }
  };

  const resetConversation = () => {
    setConversationId(null);
    setChat([]);
    setError(null);
    setQuestion("");
    textareaRef.current?.focus();
  };

  const isEmpty = orderedChat.length === 0 && !loading;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles size={18} className="text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Ask Genie</h2>
            <p className="text-xs text-muted-foreground">
              AI-powered fleet health intelligence
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversationId && (
            <Badge variant="secondary" className="text-[10px] font-mono">
              {conversationId.slice(0, 8)}...
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={resetConversation}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw size={14} />
            New chat
          </Button>
        </div>
      </div>

      {/* Chat area */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isEmpty ? (
          /* Empty state */
          <div className="flex h-full flex-col items-center justify-center px-6 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5">
              <MessageCircle size={28} className="text-primary" />
            </div>
            <h3 className="mt-6 text-lg font-semibold">What would you like to know?</h3>
            <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
              Ask questions about robot health, maintenance trends, risk scores, and fleet KPIs.
            </p>
            <div className="mt-8 grid w-full max-w-lg gap-3">
              {SAMPLE_QUESTIONS.map((sample) => (
                <button
                  key={sample.text}
                  onClick={() => void askGenie(sample.text)}
                  className="group flex items-center gap-3 rounded-xl border bg-background p-4 text-left text-sm transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-primary/10">
                    <sample.icon size={16} className="text-muted-foreground group-hover:text-primary" />
                  </div>
                  <span className="text-muted-foreground group-hover:text-foreground">
                    {sample.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="space-y-1 px-4 py-4">
            {orderedChat.map((turn, idx) => (
              <div key={`${turn.result.message_id}-${idx}`} className="space-y-1">
                <UserMessage text={turn.question} />
                <AssistantMessage turn={turn} onFollowUp={(q) => void askGenie(q)} />
              </div>
            ))}

            {loading && pendingQuestion && (
              <div className="space-y-1">
                <UserMessage text={pendingQuestion} />
                <div className="flex gap-3 px-2 py-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles size={16} className="text-primary" />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex gap-1">
                      <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-primary/40 [animation-delay:0ms]" />
                      <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-primary/40 [animation-delay:150ms]" />
                      <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-primary/40 [animation-delay:300ms]" />
                    </div>
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mx-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t bg-background/50 p-4">
        <div className="mx-auto max-w-3xl">
          <div className="relative rounded-2xl border bg-background shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-2 focus-within:ring-primary/20">
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              placeholder="Ask about maintenance trends, risk, or KPIs..."
              rows={1}
              className="w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 pr-14 text-sm outline-none placeholder:text-muted-foreground/60"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void askGenie();
                }
              }}
            />
            <Button
              size="icon"
              onClick={() => void askGenie()}
              disabled={loading || !question.trim()}
              className="absolute bottom-2 right-2 h-8 w-8 rounded-xl"
            >
              <Send size={14} />
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/50">
            Genie queries your fleet data in real-time. Press Enter to send.
          </p>
        </div>
      </div>
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end gap-3 px-2 py-2">
      <div className="max-w-[75%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm">
        {text}
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <User size={16} className="text-muted-foreground" />
      </div>
    </div>
  );
}

function AssistantMessage({
  turn,
  onFollowUp,
}: {
  turn: ChatTurn;
  onFollowUp: (q: string) => void;
}) {
  const [sqlOpen, setSqlOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyText = async () => {
    await navigator.clipboard.writeText(turn.result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex gap-3 px-2 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Sparkles size={16} className="text-primary" />
      </div>
      <div className="min-w-0 max-w-[85%] space-y-3">
        {/* Main text */}
        <div className="group relative rounded-2xl rounded-tl-md border bg-muted/20 px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {cleanGenieText(turn.result.text)}
          </p>
          <button
            onClick={() => void copyText()}
            className="absolute right-2 top-2 rounded-md p-1.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
            title="Copy response"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} className="text-muted-foreground" />}
          </button>
        </div>

        {/* SQL expandable */}
        {turn.result.sql && (
          <button
            onClick={() => setSqlOpen(!sqlOpen)}
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            {sqlOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Database size={14} />
            <span>Generated SQL</span>
          </button>
        )}
        {sqlOpen && turn.result.sql && (
          <pre className="overflow-auto rounded-xl border bg-zinc-950 p-4 text-xs leading-relaxed text-emerald-400">
            <code>{turn.result.sql}</code>
          </pre>
        )}

        {/* Query results expandable */}
        {turn.result.query_result && turn.result.query_result.columns.length > 0 && (
          <>
            <button
              onClick={() => setResultsOpen(!resultsOpen)}
              className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              {resultsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Table2 size={14} />
              <span>
                Query Results ({turn.result.query_result.row_count.toLocaleString()} rows)
              </span>
            </button>
            {resultsOpen && (
              <div className="max-h-[40vh] overflow-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      {turn.result.query_result.columns.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2.5 text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {turn.result.query_result.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-t transition-colors hover:bg-muted/30">
                        {row.map((value, colIdx) => (
                          <td key={colIdx} className="px-3 py-2 font-mono">
                            {String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Suggested follow-ups */}
        {turn.result.suggested_questions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {turn.result.suggested_questions.slice(0, 4).map((sq) => (
              <button
                key={sq}
                onClick={() => onFollowUp(sq)}
                className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
              >
                {sq}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
