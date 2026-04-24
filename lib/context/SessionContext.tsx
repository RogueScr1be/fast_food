import React, { createContext, useCallback, useEffect, useState } from 'react';
import * as UUID from 'expo-uuid';
import type { SessionState, SessionContextType } from '../types/session';
import { getTodayDateKey } from '../utils/date-key';

export const SessionContext = createContext<SessionContextType | null>(null);

interface SessionProviderProps {
  children: React.ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [state, setState] = useState<SessionState>({
    userId: UUID.v4(),
    sessionId: UUID.v4(),
    sessionDate: getTodayDateKey(),
    selectedRecipeId: null,
    selectedMood: 'default',
    selectedPackId: null,
    currentStepIndex: 0,
    completedStepIds: new Set(),
    timerActive: false,
    timerDuration: 0,
  });

  // Guard: Ensure selectedRecipeId is scalar
  const setSelectedRecipe = useCallback((recipeId: string) => {
    setState(prev => ({
      ...prev,
      selectedRecipeId: recipeId,
      currentStepIndex: 0,
      completedStepIds: new Set(),
      timerActive: false,
    }));
  }, []);

  const setSelectedMood = useCallback(
    (mood: 'tired' | 'celebrating' | 'default') => {
      setState(prev => ({
        ...prev,
        selectedMood: mood,
        selectedPackId: null, // Clear pack when mood is selected
        selectedRecipeId: null, // Reset recipe selection
      }));
    },
    []
  );

  const setSelectedPack = useCallback((packId: string | null) => {
    setState(prev => ({
      ...prev,
      selectedPackId: packId,
      selectedMood: 'default', // Reset mood when pack is selected
      selectedRecipeId: null, // Reset recipe selection
    }));
  }, []);

  const setCurrentStep = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      currentStepIndex: Math.max(0, index),
    }));
  }, []);

  const completeStep = useCallback((stepIndex: number) => {
    setState(prev => {
      const newCompleted = new Set(prev.completedStepIds);
      newCompleted.add(stepIndex);
      return {
        ...prev,
        completedStepIds: newCompleted,
      };
    });
  }, []);

  const setTimerActive = useCallback((active: boolean) => {
    setState(prev => ({
      ...prev,
      timerActive: active,
    }));
  }, []);

  const setTimerDuration = useCallback((seconds: number) => {
    setState(prev => ({
      ...prev,
      timerDuration: Math.max(0, seconds),
    }));
  }, []);

  const markRecipeAccepted = useCallback(() => {
    setState(prev => ({
      ...prev,
      recipeAcceptedAt: new Date(),
    }));
  }, []);

  const markRecipeCompleted = useCallback(() => {
    setState(prev => ({
      ...prev,
      completedAt: new Date(),
    }));
  }, []);

  const resetSession = useCallback(() => {
    setState({
      userId: UUID.v4(),
      sessionId: UUID.v4(),
      sessionDate: getTodayDateKey(),
      selectedRecipeId: null,
      selectedMood: 'default',
      selectedPackId: null,
      currentStepIndex: 0,
      completedStepIds: new Set(),
      timerActive: false,
      timerDuration: 0,
    });
  }, []);

  const value: SessionContextType = {
    state,
    setSelectedRecipe,
    setSelectedMood,
    setSelectedPack,
    setCurrentStep,
    completeStep,
    setTimerActive,
    setTimerDuration,
    markRecipeAccepted,
    markRecipeCompleted,
    resetSession,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
