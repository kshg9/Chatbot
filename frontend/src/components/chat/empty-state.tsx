'use client';

import { motion } from 'framer-motion';
import { Heart, SmilePlus, Frown, Flame, CloudRain, Zap } from 'lucide-react';

interface EmptyStateProps {
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
  {
    icon: Frown,
    title: 'Feeling sad',
    description: 'Let Buddy comfort you',
    prompt: 'I am feeling very sad today.',
    color: 'from-blue-400 to-indigo-500',
  },
  {
    icon: Flame,
    title: 'Feeling angry',
    description: 'Buddy will listen patiently',
    prompt: 'I am Angry and Sad.',
    color: 'from-red-400 to-orange-500',
  },
  {
    icon: SmilePlus,
    title: 'Feeling happy',
    description: 'Share your joy with Buddy',
    prompt: 'Look at me, I am so happy and brave!',
    color: 'from-yellow-400 to-amber-500',
  },
  {
    icon: CloudRain,
    title: 'Feeling tired',
    description: 'Buddy understands exhaustion',
    prompt: 'I had a very tired day.',
    color: 'from-teal-400 to-cyan-500',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 100,
      damping: 12,
    },
  },
};

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 min-h-[calc(100vh-180px)]">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="text-center w-full max-w-2xl mx-auto"
      >
        {/* Animated Logo */}
        <motion.div
          variants={itemVariants}
          className="relative mb-8"
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ 
              type: 'spring', 
              stiffness: 200, 
              damping: 15,
              delay: 0.1 
            }}
            className="w-20 h-20 md:w-24 md:h-24 mx-auto rounded-3xl bg-gradient-to-br from-pink-400 via-rose-400 to-red-400 flex items-center justify-center shadow-2xl shadow-pink-400/40"
          >
            <motion.div
              animate={{ 
                rotate: [0, 10, -10, 0],
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity, 
                repeatDelay: 3 
              }}
            >
              <Heart className="h-10 w-10 md:h-12 md:w-12 text-white" />
            </motion.div>
          </motion.div>
          
          {/* Floating particles */}
          <motion.div
            animate={{ 
              y: [-5, 5, -5],
              x: [-3, 3, -3],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-2 -right-8 md:-right-12"
          >
            <Zap className="h-6 w-6 text-yellow-500" />
          </motion.div>
        </motion.div>

        {/* Title */}
        <motion.h1
          variants={itemVariants}
          className="text-2xl md:text-4xl font-bold mb-3 md:mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text"
        >
          Hey, I&apos;m your Innocent Buddy!
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          variants={itemVariants}
          className="text-muted-foreground mb-10 md:mb-12 text-base md:text-lg max-w-md mx-auto"
        >
          Tell me how you&apos;re feeling — I&apos;m here to listen and care 💛
        </motion.p>

        {/* Suggestions grid */}
        <motion.div
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4"
        >
          {suggestions.map((suggestion, index) => (
            <motion.button
              key={index}
              variants={itemVariants}
              whileHover={{ 
                scale: 1.02, 
                y: -2,
                transition: { type: 'spring', stiffness: 400 } 
              }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSuggestionClick(suggestion.prompt)}
              className="group flex items-start gap-4 p-4 md:p-5 rounded-2xl border border-border bg-card/50 backdrop-blur-sm hover:bg-card hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300 text-left"
            >
              <motion.div 
                whileHover={{ rotate: [0, -10, 10, 0] }}
                transition={{ duration: 0.4 }}
                className={`w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br ${suggestion.color} flex items-center justify-center shadow-lg shrink-0`}
              >
                <suggestion.icon className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </motion.div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm md:text-base mb-1 group-hover:text-primary transition-colors">
                  {suggestion.title}
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">
                  {suggestion.description}
                </p>
              </div>
            </motion.button>
          ))}
        </motion.div>

        {/* Powered by badge */}
        <motion.div
          variants={itemVariants}
          className="mt-10 md:mt-12"
        >
          <p className="text-xs text-muted-foreground/60 flex items-center justify-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Buddy is here for you — powered by your custom fine-tuned model
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
