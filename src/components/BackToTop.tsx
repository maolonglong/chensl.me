// ai_generated - new file
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export default function BackToTop() {
	const [isVisible, setIsVisible] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const fallbackTimer = useRef<number | null>(null);

	// 返回顶部函数
	const scrollToTop = () => {
		if (typeof window === 'undefined') {
			return;
		}

		const distance = window.scrollY;
		const prefersReducedMotion =
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

		window.scrollTo({
			top: 0,
			left: 0,
			behavior,
		});

		if (!prefersReducedMotion) {
			if (fallbackTimer.current !== null) {
				window.clearTimeout(fallbackTimer.current);
			}

			const duration = Math.min(1200, Math.max(300, distance / 1.5));

			fallbackTimer.current = window.setTimeout(() => {
				if (window.scrollY > 0) {
					window.scrollTo({
						top: 0,
						left: 0,
						behavior: 'auto',
					});
				}

				fallbackTimer.current = null;
			}, duration);
		}

		buttonRef.current?.blur();
	};

	useEffect(() => {
		return () => {
			if (fallbackTimer.current !== null && typeof window !== 'undefined') {
				window.clearTimeout(fallbackTimer.current);
				fallbackTimer.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		const threshold = 300;
		let ticking = false;
		let frameId: number | null = null;

		const updateVisibility = () => {
			setIsVisible(window.scrollY > threshold);
			ticking = false;
			frameId = null;
		};

		const handleScroll = () => {
			if (!ticking) {
				frameId = window.requestAnimationFrame(updateVisibility);
				ticking = true;
			}
		};

		window.addEventListener('scroll', handleScroll, { passive: true });

		// 初始检查
		updateVisibility();

		// 清理事件监听
		return () => {
			if (frameId !== null) {
				window.cancelAnimationFrame(frameId);
			}
			window.removeEventListener('scroll', handleScroll);
			if (fallbackTimer.current !== null) {
				window.clearTimeout(fallbackTimer.current);
				fallbackTimer.current = null;
			}
		};
	}, []);

	return (
		<button
			ref={buttonRef}
			className={clsx('back-to-top', { visible: isVisible })}
			onClick={scrollToTop}
			aria-label="返回顶部"
			title="返回顶部"
			type="button"
			tabIndex={isVisible ? 0 : -1}
			aria-hidden={!isVisible}
		>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M18 15l-6-6-6 6" />
			</svg>
		</button>
	);
}
