/* Íconos de línea fina (mismo trazo que la web) */
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@majobella/core';

export type IconName =
  | 'home' | 'sparkle' | 'calendar' | 'user' | 'plus' | 'minus' | 'check' | 'close' | 'chevron-right' | 'chevron-left' | 'chevron-down'
  | 'clock' | 'whatsapp' | 'map' | 'gift' | 'bag' | 'bell' | 'logout' | 'copy' | 'upload' | 'star' | 'arrow-right' | 'mail'
  | 'card' | 'bank' | 'info' | 'search' | 'refresh' | 'ticket' | 'phone' | 'edit' | 'trash' | 'external' | 'heart' | 'google';

export function Icon({ name, size = 22, color = colors.ink, stroke = 1.5 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  const p = { stroke: color, strokeWidth: stroke, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const body = (() => {
    switch (name) {
      case 'home': return <Path {...p} d="M3.5 10.5 12 4l8.5 6.5V20a.5.5 0 0 1-.5.5h-5v-6h-6v6H4a.5.5 0 0 1-.5-.5z" />;
      case 'sparkle': return <Path {...p} d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5zM18.5 15.5c.3 1.7 1 2.4 2.5 2.7-1.5.3-2.2 1-2.5 2.6-.3-1.6-1-2.3-2.5-2.6 1.5-.3 2.2-1 2.5-2.7z" />;
      case 'calendar': return <><Rect {...p} x="3.5" y="5" width="17" height="15.5" rx="1" /><Path {...p} d="M3.5 9.5h17M8 3v4M16 3v4" /></>;
      case 'user': return <><Circle {...p} cx="12" cy="8" r="4" /><Path {...p} d="M4 20.5c1.2-4 4.2-6 8-6s6.8 2 8 6" /></>;
      case 'plus': return <Path {...p} d="M12 5v14M5 12h14" />;
      case 'minus': return <Path {...p} d="M5 12h14" />;
      case 'check': return <Path {...p} d="m4.5 12.5 5 5 10-11" />;
      case 'close': return <Path {...p} d="M6 6l12 12M18 6 6 18" />;
      case 'chevron-right': return <Path {...p} d="m9 5 7 7-7 7" />;
      case 'chevron-left': return <Path {...p} d="m15 5-7 7 7 7" />;
      case 'chevron-down': return <Path {...p} d="m5 9 7 7 7-7" />;
      case 'clock': return <><Circle {...p} cx="12" cy="12" r="8.5" /><Path {...p} d="M12 7.5V12l3 2" /></>;
      case 'whatsapp': return <><Path {...p} d="M4 20l1.2-3.7A8.5 8.5 0 1 1 8 19z" /><Path {...p} d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-2z" /></>;
      case 'map': return <><Path {...p} d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" /><Circle {...p} cx="12" cy="10" r="2.3" /></>;
      case 'gift': return <><Rect {...p} x="3.5" y="8.5" width="17" height="4" /><Path {...p} d="M5 12.5V20.5h14v-8M12 8.5v12M12 8.5c-1-3-5-4.5-5.5-2S10 8.5 12 8.5zm0 0c1-3 5-4.5 5.5-2S14 8.5 12 8.5z" /></>;
      case 'bag': return <><Path {...p} d="M5 8h14l-1 12.5H6z" /><Path {...p} d="M9 10V6.5a3 3 0 0 1 6 0V10" /></>;
      case 'bell': return <Path {...p} d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />;
      case 'logout': return <Path {...p} d="M14 4.5H5.5v15H14M10 12h10M17 8.5l3.5 3.5-3.5 3.5" />;
      case 'copy': return <><Rect {...p} x="8.5" y="8.5" width="11" height="12" rx="1" /><Path {...p} d="M15.5 8.5v-4h-11v12h4" /></>;
      case 'upload': return <Path {...p} d="M12 15.5v-11M7.5 9 12 4.5 16.5 9M4.5 15v4.5h15V15" />;
      case 'star': return <Path {...p} fill={color} d="m12 3.8 2.5 5.3 5.7.7-4.2 3.9 1.1 5.7L12 16.6l-5.1 2.8L8 13.7 3.8 9.8l5.7-.7z" />;
      case 'arrow-right': return <Path {...p} d="M4 12h15M13.5 6.5 19 12l-5.5 5.5" />;
      case 'mail': return <><Rect {...p} x="3.5" y="5.5" width="17" height="13" rx="1" /><Path {...p} d="m4 6.5 8 6.5 8-6.5" /></>;
      case 'card': return <><Rect {...p} x="3" y="5.5" width="18" height="13" rx="1.5" /><Path {...p} d="M3 9.5h18M6.5 15h4" /></>;
      case 'bank': return <Path {...p} d="M3.5 9.5 12 4.5l8.5 5zM5.5 10v7.5M9.5 10v7.5M14.5 10v7.5M18.5 10v7.5M3.5 20h17" />;
      case 'info': return <><Circle {...p} cx="12" cy="12" r="8.5" /><Path {...p} d="M12 11v5.5M12 7.8v.2" /></>;
      case 'search': return <><Circle {...p} cx="11" cy="11" r="6.5" /><Path {...p} d="m16 16 4.5 4.5" /></>;
      case 'refresh': return <Path {...p} d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />;
      case 'ticket': return <Path {...p} d="M3.5 7.5h17v3a1.5 1.5 0 0 0 0 3v3h-17v-3a1.5 1.5 0 0 0 0-3zM14 7.5v9" />;
      case 'phone': return <Path {...p} d="M6.5 3.5h3l1.5 4-2 1.5a10 10 0 0 0 6 6l1.5-2 4 1.5v3a1.5 1.5 0 0 1-1.5 1.5C10.5 19 5 13.5 5 5a1.5 1.5 0 0 1 1.5-1.5z" />;
      case 'edit': return <Path {...p} d="M4.5 19.5h4l10-10-4-4-10 10zM13 7l4 4" />;
      case 'trash': return <Path {...p} d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />;
      case 'external': return <Path {...p} d="M13.5 4.5h6v6M19.5 4.5 11 13M17 14v5.5H4.5V7H10" />;
      case 'heart': return <Path {...p} d="M12 19.5s-7.5-4.5-7.5-10a4 4 0 0 1 7.5-2 4 4 0 0 1 7.5 2c0 5.5-7.5 10-7.5 10z" />;
      case 'google': return <><Path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z" /><Path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" /><Path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z" /><Path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" /></>;
    }
  })();
  return <Svg width={size} height={size} viewBox="0 0 24 24">{body}</Svg>;
}
