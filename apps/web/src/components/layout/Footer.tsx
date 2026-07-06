import { Link } from 'react-router-dom';
import { Logo } from './Logo';

/**
 * Footer 页脚
 * -------------------------------------------------------------
 * 深蓝底（brand-primary-950，禁纯黑）+ 分栏链接（产品/法务/关于）
 * + 版权 + 备案位占位。
 */

export interface FooterLink {
  label: string;
  to: string;
}

export interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export interface FooterProps {
  /** 分栏配置，默认提供 产品/法务/关于 三栏 */
  columns?: FooterColumn[];
  /** 版权主体名称，默认 向内求索 InnerQuest */
  brandName?: string;
  /** 备案号占位文案（无则显示占位提示，供人工填入） */
  icp?: string;
  /** 追加类名 */
  className?: string;
}

const DEFAULT_COLUMNS: FooterColumn[] = [
  {
    title: '产品',
    links: [
      { label: '开始测评', to: '/assessment/intro' },
      { label: '人格类型库', to: '/#types' },
      { label: '职业地图', to: '/#careers' },
      { label: '定价', to: '/#pricing' },
    ],
  },
  {
    title: '法务',
    links: [
      { label: '隐私政策', to: '/privacy' },
      { label: '服务条款', to: '/terms' },
    ],
  },
  {
    title: '关于',
    links: [
      { label: '关于我们', to: '/about' },
      { label: '联系我们', to: '/about#contact' },
    ],
  },
];

export function Footer({
  columns = DEFAULT_COLUMNS,
  brandName = '向内求索 InnerQuest',
  icp,
  className = '',
}: FooterProps) {
  const year = new Date().getFullYear();
  return (
    <footer className={`bg-brand-primary-950 text-neutral-300 ${className}`}>
      <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          {/* 品牌区 */}
          <div className="max-w-xs">
            <Logo size={30} color="#93c5fd" textClassName="text-white" />
            <p className="mt-4 text-sm leading-relaxed text-neutral-400">
              以 MBTI 为起点，陪你向内求索，把性格洞察落到真实的职业选择上。
            </p>
          </div>

          {/* 链接分栏 */}
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h4 className="font-display text-sm font-semibold text-white">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-neutral-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* 版权 + 备案 */}
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-neutral-500 md:flex-row md:items-center md:justify-between">
          <p>© {year} {brandName}. 保留所有权利。</p>
          <p>
            {icp ? (
              <a
                href="https://beian.miit.gov.cn"
                target="_blank"
                rel="noreferrer"
                className="hover:text-neutral-300"
              >
                {icp}
              </a>
            ) : (
              <span className="opacity-70">备案号待填入（ICP / 公安备案）</span>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;