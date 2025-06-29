import React, { createContext, useContext, useState, ReactNode } from 'react';

interface UserProfile {
  id?: number;
  adults: number;
  kids: number;
  favorites: string[];
  allergies: string[];
  timePreference: string;
  budgetPerServing: number;
  skipNights: string[];
}

interface MealPlan {
  day: string;
  meal: string;
  cookTime: string;
  cost: string;
  ingredients: string[];
}

interface AppContextType {
  userProfile: UserProfile | null;
  setUserProfile: (profile: UserProfile | null) => void;
  currentMealPlan: MealPlan[];
  setCurrentMealPlan: (plan: MealPlan[]) => void;
  groceryList: string[];
  setGroceryList: (list: string[]) => void;
  isListening: boolean;
  setIsListening: (listening: boolean) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (completed: boolean) => void;
  notificationCount: number;
  setNotificationCount: (count: number) => void;
  isAppLocked: boolean;
  setIsAppLocked: (locked: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [currentMealPlan, setCurrentMealPlan] = useState<MealPlan[]>([]);
  const [groceryList, setGroceryList] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [isAppLocked, setIsAppLocked] = useState(false);

  return (
    <AppContext.Provider value={{
      userProfile,
      setUserProfile,
      currentMealPlan,
      setCurrentMealPlan,
      groceryList,
      setGroceryList,
      isListening,
      setIsListening,
      hasCompletedOnboarding,
      setHasCompletedOnboarding,
      notificationCount,
      setNotificationCount,
      isAppLocked,
      setIsAppLocked
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};