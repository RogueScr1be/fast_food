export interface SessionState {
  // User & Session
  userId: string; // Ephemeral per session (UUID)
  sessionId: string; // Unique session identifier
  sessionDate: string; // YYYY-MM-DD (device local date)

  // Recipe Selection (CRITICAL: scalar, never array)
  selectedRecipeId: string | null; // One recipe per session

  // Mood & Pack Selection
  selectedMood: 'tired' | 'celebrating' | 'default';
  selectedPackId?: string | null; // Optional pack context

  // Cooking State
  currentStepIndex: number; // 0-indexed
  completedStepIds: Set<number>; // Which steps completed
  timerActive: boolean;
  timerDuration: number; // Seconds remaining

  // History
  recipeAcceptedAt?: Date;
  completedAt?: Date;
}

export interface SessionContextType {
  state: SessionState;

  // Recipe Selection
  setSelectedRecipe(recipeId: string): void;
  setSelectedMood(mood: 'tired' | 'celebrating' | 'default'): void;
  setSelectedPack(packId: string | null): void;

  // Cooking
  setCurrentStep(index: number): void;
  completeStep(stepIndex: number): void;
  setTimerActive(active: boolean): void;
  setTimerDuration(seconds: number): void;

  // Completion
  markRecipeAccepted(): void;
  markRecipeCompleted(): void;
  resetSession(): void;
}
