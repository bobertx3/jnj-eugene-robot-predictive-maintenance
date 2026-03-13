import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
  "Which robots are most likely to need maintenance in the next 30 days, and why?",
  "What are the top risk drivers across the fleet right now?",
  "Which components have the highest service-needed rate and what action should we take first?",
] as const;

function cleanGenieText(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/^- /gm, "• ")
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
      setQuestion("");
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
  };

  const askSample = async (sampleQuestion: string) => {
    if (loading) return;
    setQuestion(sampleQuestion);
    await askGenie(sampleQuestion);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-primary/10 bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Ask Genie</p>
          <p className="text-xs text-muted-foreground">
            Executive Q&A for robot health and predictive maintenance
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetConversation}>
          New chat
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
        {orderedChat.length === 0 && !loading && (
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Start with one of these prompts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {SAMPLE_QUESTIONS.map((sample) => (
                <Button
                  key={sample}
                  variant="outline"
                  size="sm"
                  className="h-auto max-w-full whitespace-normal text-left text-xs"
                  onClick={() => void askSample(sample)}
                >
                  {sample}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        {orderedChat.map((turn, idx) => (
          <div key={`${turn.result.message_id}-${idx}`} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-4 py-2 text-sm text-primary-foreground">
                {turn.question}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px]">AI</AvatarFallback>
              </Avatar>
              <div className="w-full max-w-[90%] space-y-3 rounded-2xl rounded-tl-md border bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{turn.result.status}</Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6">
                  {cleanGenieText(turn.result.text)}
                </p>

                {turn.result.sql && (
                  <details className="rounded border bg-background p-3">
                    <summary className="cursor-pointer list-none text-sm text-primary hover:underline">
                      View generated SQL
                    </summary>
                    <pre className="mt-3 overflow-auto rounded bg-muted/30 p-2 text-xs">
                      {turn.result.sql}
                    </pre>
                  </details>
                )}

                {turn.result.query_result && turn.result.query_result.columns.length > 0 && (
                  <details className="rounded border bg-background p-3">
                    <summary className="cursor-pointer list-none text-sm text-primary hover:underline">
                      View query results ({turn.result.query_result.row_count.toLocaleString()} rows)
                    </summary>
                    <div className="mt-3 max-h-[36vh] overflow-auto rounded border">
                      <table className="w-full text-xs md:text-sm">
                        <thead className="bg-muted/60">
                          <tr>
                            {turn.result.query_result.columns.map((col) => (
                              <th key={col} className="px-3 py-2 text-left font-mono">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {turn.result.query_result.rows.map((row, rowIdx) => (
                            <tr key={rowIdx} className="border-t">
                              {row.map((value, colIdx) => (
                                <td key={colIdx} className="px-3 py-2">
                                  {String(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                {turn.result.suggested_questions.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      Suggested follow-ups
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {turn.result.suggested_questions.slice(0, 5).map((sq) => (
                        <Button
                          key={sq}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-auto whitespace-normal text-left text-xs"
                          onClick={() => {
                            setQuestion(sq);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          {sq}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && pendingQuestion && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-4 py-2 text-sm text-primary-foreground">
                {pendingQuestion}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px]">AI</AvatarFallback>
              </Avatar>
              <div className="rounded-2xl rounded-tl-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                Genie is thinking...
              </div>
            </div>
          </div>
        )}

        {conversationId && (
          <p className="text-xs text-muted-foreground">
            Conversation: <code>{conversationId}</code>
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div ref={endRef} />
      </div>

      <div className="border-t bg-background/95 p-3">
        <div className="rounded-xl border bg-background p-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about maintenance trends, risk, or KPIs..."
              className="min-h-[60px] flex-1 resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void askGenie();
                }
              }}
            />
            <div className="flex items-center gap-2">
              <Button onClick={() => void askGenie()} disabled={loading || !question.trim()}>
                {loading ? "Asking..." : "Send"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
