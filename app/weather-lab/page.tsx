import { notFound } from 'next/navigation';
import { WeatherLab } from '@/components/weather-lab';

export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <WeatherLab />;
}
