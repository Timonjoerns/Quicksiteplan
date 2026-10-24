import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the sidebar with feature selection and a fetch button; export is hidden until data is loaded', () => {
  render(<App />);
  expect(screen.getByText(/Kontext/i)).toBeInTheDocument();
  expect(screen.getByText(/Water Bodies/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Fetch Data/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Export as PDF/i })).not.toBeInTheDocument();
});

test('all OSM feature types are selected by default except railways', () => {
  render(<App />);
  expect(screen.getByLabelText(/Water Bodies/i)).toBeChecked();
  expect(screen.getByLabelText(/Streets/i)).toBeChecked();
  expect(screen.getByLabelText(/Buildings/i)).toBeChecked();
  expect(screen.getByLabelText(/Railways/i)).not.toBeChecked();
  expect(screen.getByLabelText(/Trees/i)).toBeChecked();
  expect(screen.getByLabelText(/Green Areas/i)).toBeChecked();
});
