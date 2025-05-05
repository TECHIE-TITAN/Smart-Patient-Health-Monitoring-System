import React, { useEffect, useRef, useState } from 'react';

const AudioAlert = ({ isActive, type = 'high-risk' }) => {
  const audioRef = useRef(null);
  const [muted, setMuted] = useState(false);
  
  // Create different alert sounds based on type
  const getAlertSound = () => {
    switch(type) {
      case 'high-risk':
        return 'https://assets.mixkit.co/active_storage/sfx/3005/3005-preview.mp3'; // Emergency alert sound
      case 'fever':
        return 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'; // Different alert for fever
      case 'moderate-risk':
        return 'https://assets.mixkit.co/active_storage/sfx/1862/1862-preview.mp3'; // Moderate alert sound
      default:
        return 'https://assets.mixkit.co/active_storage/sfx/3005/3005-preview.mp3';
    }
  };

  // Play or pause the alert sound based on isActive prop
  useEffect(() => {
    if (!audioRef.current) return;

    if (isActive && !muted) {
      audioRef.current.src = getAlertSound();
      audioRef.current.loop = true;
      
      // Play the sound and handle any autoplay restrictions
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Audio play was prevented:", error);
        });
      }
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [isActive, muted, type]);

  // Toggle mute state
  const toggleMute = () => {
    setMuted(prev => !prev);
  };

  return (
    <>
      <audio ref={audioRef} preload="auto" />
      {isActive && (
        <button 
          className={`mute-alert-btn ${muted ? 'muted' : ''}`} 
          onClick={toggleMute} 
          aria-label={muted ? "Unmute alert" : "Mute alert"}
          title={muted ? "Unmute alert" : "Mute alert"}
        >
          {muted ? "🔇" : "🔊"}
        </button>
      )}
    </>
  );
};

export default AudioAlert; 