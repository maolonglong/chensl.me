import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export default function BackToTop() {
	const [isVisible, setIsVisible] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);

	// 返回顶部函数
	const scrollToTop = () => {
		if (typeof window === 'undefined') {
			return;
		}

		const prefersReducedMotion =
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

		window.scrollTo({
			top: 0,
			left: 0,
			behavior,
		});
	};

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		const threshold = 300;
		let ticking = false;
		let frameId: ReturnType<typeof requestAnimationFrame> | null = null;

		const updateVisibility = () => {
			try {
				setIsVisible(window.scrollY > threshold);
			} finally {
				ticking = false;
				frameId = null;
			}
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
