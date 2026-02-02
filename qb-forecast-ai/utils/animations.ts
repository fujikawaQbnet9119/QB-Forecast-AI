// Animation utilities for dashboard components

export const fadeIn = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.3 }
};

export const slideUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: 'easeOut' }
};

export const slideDown = {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: 'easeOut' }
};

export const slideLeft = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.4, ease: 'easeOut' }
};

export const slideRight = {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.4, ease: 'easeOut' }
};

export const scaleIn = {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.3, ease: 'easeOut' }
};

export const staggerChildren = {
    animate: {
        transition: {
            staggerChildren: 0.1
        }
    }
};

// CSS class-based animations (Tailwind)
export const animationClasses = {
    fadeIn: 'animate-fade-in',
    slideUp: 'animate-slide-up',
    slideDown: 'animate-slide-down',
    pulse: 'animate-pulse',
    spin: 'animate-spin',
    bounce: 'animate-bounce',
    ping: 'animate-ping'
};

// Hover effects
export const hoverScale = 'transition-transform duration-200 hover:scale-105';
export const hoverShadow = 'transition-shadow duration-200 hover:shadow-lg';
export const hoverBrightness = 'transition-all duration-200 hover:brightness-110';
export const hoverOpacity = 'transition-opacity duration-200 hover:opacity-80';

// Card animations
export const cardHover = 'transition-all duration-300 hover:shadow-xl hover:-translate-y-1';
export const cardPress = 'active:scale-95 transition-transform duration-100';

// Button animations
export const buttonHover = 'transition-all duration-200 hover:scale-105 hover:shadow-md active:scale-95';

// Skeleton loading
export const skeleton = 'animate-pulse bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 bg-[length:200%_100%]';

// Number counter animation helper
export const animateValue = (
    start: number,
    end: number,
    duration: number,
    callback: (value: number) => void
) => {
    const startTime = Date.now();
    const difference = end - start;

    const step = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function (ease-out)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = start + difference * easeOut;

        callback(current);

        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            callback(end);
        }
    };

    requestAnimationFrame(step);
};

// Chart animation delays
export const chartAnimationDelay = (index: number, baseDelay: number = 50) => {
    return index * baseDelay;
};

// Page transition
export const pageTransition = {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.3 }
};
