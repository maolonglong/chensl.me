import { SITE_TITLE } from '@/consts';

export default function PostOgImage({ title }: { title: string }) {
	return (
		<div
			style={{
				display: 'flex',
				height: '100%',
				width: '100%',
				alignItems: 'center',
				justifyContent: 'center',
				letterSpacing: '-.02em',
				fontWeight: 700,
				background: 'white',
			}}
		>
			<div
				style={{
					left: 63,
					top: 66,
					position: 'absolute',
					display: 'flex',
					alignItems: 'center',
				}}
			>
				<span
					style={{
						width: 36,
						height: 36,
						background: 'black',
					}}
				/>
				<span
					style={{
						marginLeft: 12,
						fontSize: 30,
					}}
				>
					{SITE_TITLE}
				</span>
			</div>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					justifyContent: 'center',
					padding: '32px 75px',
					margin: '0 63px',
					fontSize: 60,
					width: 'auto',
					maxWidth: 825,
					textAlign: 'center',
					backgroundColor: 'black',
					color: 'white',
					lineHeight: 1.4,
				}}
			>
				{title}
			</div>
		</div>
	);
}
