// ponytail: trình duyệt (Google Translate, Grammarly, trình chặn quảng cáo...) tự ý
// tách/xoá text node trong DOM mà React quản lý, khiến React insertBefore/removeChild
// một node đã không còn ở đúng vị trí -> "NotFoundError" và crash trắng trang. Không
// thể chặn hết mọi extension (translate="no" chỉ chặn riêng Google Translate), nên
// patch 2 API DOM này để bỏ qua thao tác không hợp lệ thay vì throw. Nếu React tự
// đổi cách áp dụng patch này (đổi API commit), cần rà lại theo bản React mới.
export function patchDomForExtensions(): void {
  if (typeof Node !== "function" || !Node.prototype) return;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      console.warn("[patchDomForExtensions] Bỏ qua removeChild trên node không phải con trực tiếp", child, this);
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn("[patchDomForExtensions] Bỏ qua insertBefore với referenceNode không phải con trực tiếp", referenceNode, this);
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
