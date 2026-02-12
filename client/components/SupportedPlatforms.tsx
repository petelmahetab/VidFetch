
import React from 'react';
import PlatformIcon from './PlatformIcon';
import { Platform } from '../types';

const platforms: Platform[] = [
  {
    id: '1',
    name: 'Instagram',
    icon: 'photo_camera',            
    color: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500/30', 
    hoverColor: 'text-pink-400'
  },
  {
    id: '2',
    name: 'X / Twitter',
    icon: 'close',
    color: 'bg-sky-500/20',
    hoverColor: 'text-sky-400'
  },
  {
    id: '3',
    name: 'Facebook',
    icon: 'facebook',
    color: 'bg-blue-600/20',
    hoverColor: 'text-blue-500'
  },
  {
    id: '4',
    name: 'Snapchat',
    icon: 'face',             
    color: 'bg-yellow-500/20',
    hoverColor: 'text-yellow-400'
  },
];

const SupportedPlatforms: React.FC = () => {
  return (
    <div className="flex flex-wrap justify-center gap-6 md:gap-10 mb-10 opacity-80 hover:opacity-100 transition-opacity">
      {platforms.map((p) => (
        <PlatformIcon key={p.id} platform={p} onClick={() => { }} />
      ))}
    </div>
  );
};

export default SupportedPlatforms;
