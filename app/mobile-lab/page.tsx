import { notFound } from 'next/navigation';
import { MobileLab } from '@/components/mobile-lab';
import './mobile-lab.css';

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <MobileLab />;
}
