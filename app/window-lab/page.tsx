import { notFound } from 'next/navigation';
import { WindowLab } from '@/components/window-lab';

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <WindowLab />;
}
