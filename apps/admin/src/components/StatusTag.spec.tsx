import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusTag } from './StatusTag';

describe('StatusTag', () => {
  it('renders stable status text', () => {
    render(<StatusTag tone="success">运行正常</StatusTag>);
    expect(screen.getByText('运行正常')).toBeInTheDocument();
  });
});
