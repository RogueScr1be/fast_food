import { Redirect } from 'expo-router';

export default function Index() {
  // Redirect directly to /deal to show first meal immediately
  // No mode selector, no hub — just show one answer
  return <Redirect href="/deal" />;
}
