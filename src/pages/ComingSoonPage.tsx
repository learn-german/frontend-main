/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface ComingSoonPageProps {
  title: string;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ title }) => (
  <div className="max-w-2xl mx-auto text-center py-20 space-y-3">
    <h1 className="text-2xl font-display font-black text-slate-900">{title}</h1>
    <p className="text-sm text-slate-500">Tính năng đang được phát triển, quay lại sau nhé!</p>
  </div>
);
