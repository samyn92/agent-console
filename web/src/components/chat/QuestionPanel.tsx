import type { Component } from "solid-js";
import { createSignal, For, Show, createMemo } from "solid-js";
import { FiHelpCircle, FiX, FiCheck, FiChevronRight } from "solid-icons/fi";

interface QuestionOption {
  label: string;
  description: string;
}

interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
}

export interface PendingQuestion {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
}

interface QuestionPanelProps {
  question: PendingQuestion;
  onAnswer: (requestId: string, answers: string[][]) => void;
  onDismiss: (requestId: string) => void;
}

const QuestionPanel: Component<QuestionPanelProps> = (props) => {
  // Track selected answers for each question
  const [answers, setAnswers] = createSignal<string[][]>(
    props.question.questions.map(() => [])
  );
  const [customInputs, setCustomInputs] = createSignal<string[]>(
    props.question.questions.map(() => "")
  );
  const [currentQuestionIndex, setCurrentQuestionIndex] = createSignal(0);

  const currentQuestion = createMemo(() => props.question.questions[currentQuestionIndex()]);
  const isLastQuestion = createMemo(() => currentQuestionIndex() >= props.question.questions.length - 1);
  const totalQuestions = () => props.question.questions.length;

  const toggleOption = (questionIdx: number, label: string) => {
    setAnswers((prev) => {
      const updated = [...prev];
      const question = props.question.questions[questionIdx];
      
      if (question.multiple) {
        // Multi-select: toggle the option
        const current = updated[questionIdx] || [];
        if (current.includes(label)) {
          updated[questionIdx] = current.filter((l) => l !== label);
        } else {
          updated[questionIdx] = [...current, label];
        }
      } else {
        // Single-select: replace
        updated[questionIdx] = [label];
      }
      return updated;
    });
  };

  const setCustomAnswer = (questionIdx: number, value: string) => {
    setCustomInputs((prev) => {
      const updated = [...prev];
      updated[questionIdx] = value;
      return updated;
    });
  };

  const handleNext = () => {
    if (isLastQuestion()) {
      handleSubmit();
    } else {
      setCurrentQuestionIndex((i) => i + 1);
    }
  };

  const handleSubmit = () => {
    // Merge custom inputs into answers
    const finalAnswers = answers().map((ans, idx) => {
      const custom = customInputs()[idx]?.trim();
      if (custom && !ans.includes(custom)) {
        return [...ans, custom];
      }
      return ans;
    });
    props.onAnswer(props.question.id, finalAnswers);
  };

  const currentAnswers = createMemo(() => answers()[currentQuestionIndex()] || []);
  const hasCurrentAnswer = createMemo(() => 
    currentAnswers().length > 0 || customInputs()[currentQuestionIndex()]?.trim()
  );

  return (
    <div class="bg-surface border border-warning/30 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div class="px-4 py-3 bg-warning/10 border-b border-warning/20 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <FiHelpCircle class="w-5 h-5 text-warning" />
          <span class="font-semibold text-text">Agent has a question</span>
          <Show when={totalQuestions() > 1}>
            <span class="text-xs text-text-muted">
              ({currentQuestionIndex() + 1} of {totalQuestions()})
            </span>
          </Show>
        </div>
        <button
          onClick={() => props.onDismiss(props.question.id)}
          class="p-1 text-text-muted hover:text-text rounded transition-colors"
          title="Dismiss question"
        >
          <FiX class="w-4 h-4" />
        </button>
      </div>

      {/* Question Content */}
      <div class="p-4 space-y-4">
        {/* Question header and text */}
        <div>
          <h3 class="text-sm font-semibold text-text mb-1">{currentQuestion()?.header}</h3>
          <p class="text-sm text-text-secondary">{currentQuestion()?.question}</p>
        </div>

        {/* Options */}
        <div class="space-y-2">
          <For each={currentQuestion()?.options}>
            {(option) => {
              const isSelected = () => currentAnswers().includes(option.label);
              return (
                <button
                  onClick={() => toggleOption(currentQuestionIndex(), option.label)}
                  class={`w-full text-left p-3 rounded-lg border transition-all ${
                    isSelected()
                      ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                      : "border-border bg-surface-2 hover:border-primary/50 hover:bg-surface-hover"
                  }`}
                >
                  <div class="flex items-start gap-3">
                    <div class={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5 transition-colors ${
                      isSelected()
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-text-muted"
                    }`}>
                      <Show when={isSelected()}>
                        <FiCheck class="w-3 h-3" />
                      </Show>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class={`text-sm font-semibold ${isSelected() ? "text-primary" : "text-text"}`}>
                        {option.label}
                      </div>
                      <Show when={option.description}>
                        <div class="text-xs text-text-muted mt-0.5">{option.description}</div>
                      </Show>
                    </div>
                  </div>
                </button>
              );
            }}
          </For>
        </div>

        {/* Custom answer input (always available per OpenCode default) */}
        <div class="space-y-1">
          <label class="text-xs text-text-muted">Or type your own answer:</label>
          <input
            type="text"
            value={customInputs()[currentQuestionIndex()] || ""}
            onInput={(e) => setCustomAnswer(currentQuestionIndex(), e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hasCurrentAnswer()) {
                e.preventDefault();
                handleNext();
              }
            }}
            placeholder="Type your answer..."
            class="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent"
          />
        </div>

        {/* Multi-select hint */}
        <Show when={currentQuestion()?.multiple}>
          <p class="text-xs text-text-muted italic">You can select multiple options</p>
        </Show>
      </div>

      {/* Footer with actions */}
      <div class="px-4 py-3 bg-surface-2 border-t border-border flex items-center justify-between">
        <Show when={currentQuestionIndex() > 0}>
          <button
            onClick={() => setCurrentQuestionIndex((i) => i - 1)}
            class="px-3 py-1.5 text-sm text-text-secondary hover:text-text transition-colors"
          >
            Back
          </button>
        </Show>
        <div class="flex-1" />
        <button
          onClick={handleNext}
          disabled={!hasCurrentAnswer()}
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLastQuestion() ? (
            <>
              <FiCheck class="w-4 h-4" />
              Submit
            </>
          ) : (
            <>
              Next
              <FiChevronRight class="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default QuestionPanel;
