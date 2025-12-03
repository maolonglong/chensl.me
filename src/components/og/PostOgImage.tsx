export default function PostOgImage({
	title,
	description,
	logo,
}: {
	title: string;
	description: string;
	logo: string;
}) {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: '100%',
				width: '100%',
				background: 'white',
				padding: '60px',
			}}
		>
			<div style={{ display: 'flex' }}>
				<img src={logo} width={96} height={96} style={{ borderRadius: '24px' }} />
			</div>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					flex: 1,
					justifyContent: 'center',
					paddingBottom: '100px',
				}}
			>
				<div
					style={{
						fontSize: 64,
						fontWeight: 700,
						marginBottom: 24,
						lineHeight: 1.2,
					}}
				>
					{title}
				</div>
				<div
					style={{
						fontSize: 32,
						color: '#52525b',
						lineHeight: 1.5,
					}}
				>
					{description}
				</div>
			</div>
			<div
				style={{
					display: 'flex',
					fontSize: 24,
					fontWeight: 600,
					color: '#18181b',
				}}
			>
				chensl.me
			</div>
		</div>
	);
}
