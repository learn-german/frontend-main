/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
} as const;

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = "md",
  className = "",
}) => (
  <img
    src="/logo.png"
    alt="SelbstDeutsch"
    className={`${sizeClasses[size]} rounded-xl object-cover shrink-0 ${className}`}
  />
);
