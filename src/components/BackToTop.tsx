// ai_generated - new file
import { useCallback, useEffect, useState } from 'react';

export default function BackToTop() {
	const [isVisible, setIsVisible] = useState(false);
	const [isScrolling, setIsScrolling] = useState(false);

	// 节流函数，优化滚动事件性能
	const throttle = useCallback((func: Function, limit: number) => {
		let inThrottle: boolean;
		return function (this: any, ...args: any[]) {
			if (!inThrottle) {
				func.apply(this, args);
				inThrottle = true;
				setTimeout(() => (inThrottle = false), limit);
			}
		};
	}, []);

	// 处理滚动事件
	const handleScroll = useCallback(
		throttle(() => {
			const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

			// 如果滚动到顶部，重置滚动状态
			if (scrollTop === 0 && isScrolling) {
				setIsScrolling(false);
			}

			// 如果正在执行返回顶部滚动，不更新按钮状态
			if (!isScrolling) {
				setIsVisible(scrollTop > 300);
			}
		}, 100),
		[throttle, isScrolling]
	);

	// 返回顶部函数
	const scrollToTop = useCallback(() => {
		setIsScrolling(true); // 标记开始滚动
		setIsVisible(false); // 立即隐藏按钮

		window.scrollTo({
			top: 0,
			behavior: 'smooth',
		});

		// 等待滚动动画完成后重置状态
		setTimeout(() => {
			setIsScrolling(false);
		}, 1500); // 增加到1500ms，适应超长页面的平滑滚动
	}, []);

	// 键盘事件处理
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				scrollToTop();
			}
		},
		[scrollToTop]
	);

	useEffect(() => {
		// 添加滚动事件监听
		window.addEventListener('scroll', handleScroll, { passive: true });

		// 初始检查
		handleScroll();

		// 清理事件监听
		return () => {
			window.removeEventListener('scroll', handleScroll);
		};
	}, [handleScroll]);

	return (
		<button
			className={`back-to-top ${isVisible ? 'visible' : ''}`}
			onClick={scrollToTop}
			onKeyDown={handleKeyDown}
			aria-label="返回顶部"
			title="返回顶部"
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
