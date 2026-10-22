import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the sidebar with feature selection and export controls', () => {
  render(<App />);
  expect(screen.getByText(/Quick Site Plan/i)).toBeInTheDocument();
  expect(screen.getByText(/Select OSM Data Types/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Export as PDF/i })).toBeInTheDocument();
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
