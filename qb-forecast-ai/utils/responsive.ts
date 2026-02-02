// Responsive design utilities and breakpoint helpers

// Breakpoint definitions (matching Tailwind defaults)
export const breakpoints = {
    sm: 640,   // Small devices (phones)
    md: 768,   // Medium devices (tablets)
    lg: 1024,  // Large devices (laptops)
    xl: 1280,  // Extra large devices (desktops)
    '2xl': 1536 // 2X large devices (large desktops)
} as const;

// Media query helpers
export const mediaQueries = {
    sm: `@media (min-width: ${breakpoints.sm}px)`,
    md: `@media (min-width: ${breakpoints.md}px)`,
    lg: `@media (min-width: ${breakpoints.lg}px)`,
    xl: `@media (min-width: ${breakpoints.xl}px)`,
    '2xl': `@media (min-width: ${breakpoints['2xl']}px)`
};

// Check if current viewport matches breakpoint
export const useBreakpoint = (breakpoint: keyof typeof breakpoints): boolean => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= breakpoints[breakpoint];
};

// Get current breakpoint
export const getCurrentBreakpoint = (): keyof typeof breakpoints => {
    if (typeof window === 'undefined') return 'sm';

    const width = window.innerWidth;

    if (width >= breakpoints['2xl']) return '2xl';
    if (width >= breakpoints.xl) return 'xl';
    if (width >= breakpoints.lg) return 'lg';
    if (width >= breakpoints.md) return 'md';
    return 'sm';
};

// Responsive grid classes
export const responsiveGrid = {
    // 1 column on mobile, 2 on tablet, 3 on desktop
    '1-2-3': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
    // 1 column on mobile, 2 on tablet, 4 on desktop
    '1-2-4': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4',
    // 1 column on mobile, 3 on desktop
    '1-3': 'grid grid-cols-1 lg:grid-cols-3 gap-4',
    // 2 columns on all sizes
    '2': 'grid grid-cols-2 gap-4',
    // Auto-fit with minimum width
    autoFit: 'grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4'
};

// Responsive padding/margin
export const responsiveSpacing = {
    padding: {
        sm: 'p-4 md:p-6 lg:p-8',
        md: 'p-6 md:p-8 lg:p-10',
        lg: 'p-8 md:p-10 lg:p-12'
    },
    margin: {
        sm: 'm-4 md:m-6 lg:m-8',
        md: 'm-6 md:m-8 lg:m-10',
        lg: 'm-8 md:m-10 lg:m-12'
    }
};

// Responsive text sizes
export const responsiveText = {
    heading: 'text-2xl md:text-3xl lg:text-4xl font-black',
    subheading: 'text-xl md:text-2xl lg:text-3xl font-bold',
    body: 'text-sm md:text-base',
    small: 'text-xs md:text-sm'
};

// Container widths
export const containerWidths = {
    sm: 'max-w-screen-sm',   // 640px
    md: 'max-w-screen-md',   // 768px
    lg: 'max-w-screen-lg',   // 1024px
    xl: 'max-w-screen-xl',   // 1280px
    '2xl': 'max-w-screen-2xl', // 1536px
    full: 'max-w-full'
};

// Mobile-first utility classes
export const mobileFirst = {
    // Hide on mobile, show on desktop
    hideOnMobile: 'hidden md:block',
    // Show on mobile, hide on desktop
    showOnMobile: 'block md:hidden',
    // Stack on mobile, row on desktop
    stackOnMobile: 'flex flex-col md:flex-row',
    // Full width on mobile, auto on desktop
    fullWidthOnMobile: 'w-full md:w-auto'
};

// Touch-friendly sizes
export const touchFriendly = {
    button: 'min-h-[44px] min-w-[44px]', // Apple's recommended minimum
    input: 'min-h-[44px]',
    clickable: 'min-h-[44px] min-w-[44px] cursor-pointer'
};

// Responsive chart heights
export const chartHeights = {
    mobile: 'h-48',
    tablet: 'h-64',
    desktop: 'h-80',
    responsive: 'h-48 md:h-64 lg:h-80'
};

// Detect if device is touch-enabled
export const isTouchDevice = (): boolean => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

// Detect mobile device
export const isMobileDevice = (): boolean => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Responsive card classes
export const responsiveCard = 'rounded-lg md:rounded-xl lg:rounded-2xl p-4 md:p-5 lg:p-6';

// Responsive shadow
export const responsiveShadow = 'shadow-sm md:shadow-md lg:shadow-lg';
