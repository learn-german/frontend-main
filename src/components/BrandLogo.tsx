/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

export const BRAND_LOGO_SRC = "/assets/deutschselbst-logo-sd-interlock.svg";

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
    src={BRAND_LOGO_SRC}
    alt="DeutschSelbst"
    className={`${sizeClasses[size]} rounded-xl object-contain shrink-0 ${className}`}
  />
);
