import { useNavigate } from 'react-router-dom';

/**
 * BackButton 返回上一级按钮
 * -------------------------------------------------------------
 * - 有 to：navigate(to) 跳转逻辑父级（如详情 → 列表）。
 * - 无 to：navigate(-1) 走浏览器历史返回。
 * - ghost 风格：左箭头 + 文字，hover 时箭头轻微左移；
 *   prefers-reduced-motion 下取消位移（依赖全局 CSS 降级 + group-hover 位移仅作用于图标）。
 */

export interface BackButtonProps {
  /** 目标路径；省略则走浏览器历史返回 */
  to?: string;
  /** 按钮文字，默认「返回」 */
  label?: string;
  /** 追加类名 */
  className?: string;
}

export function BackButton({ to, label = '返回', className = '' }: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-brand-primary-700 focus-visible:ring-2 focus-visible:ring-brand-primary-300 ${className}`}
      aria-label={label}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className="transition-transform duration-normal ease-spring group-hover:-translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
      >
        <path
          d="M10 12L6 8l4-4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export default BackButton;