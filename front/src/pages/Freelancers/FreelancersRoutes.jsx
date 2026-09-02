import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import FreelancersListPage from './FreelancersListPage';
import FreelancersReviewsPage from './FreelancersReviewsPage';
import FreelancerDetailPage from './FreelancerDetailPage';
import FreelancerAreasPage from './FreelancerAreasPage';

export default function FreelancersRoutes({ apiUrl, token, user }) {
  const isFreelancer = user?.platform_role === 'freelancer';

  return (
    <Routes>
      <Route index element={
        isFreelancer && user?.id 
          ? <Navigate to={user.id} replace /> 
          : <FreelancersListPage apiUrl={apiUrl} token={token} />
      } />
      <Route path="areas" element={<FreelancerAreasPage apiUrl={apiUrl} />} />
      <Route path="reviews" element={<FreelancersReviewsPage apiUrl={apiUrl} token={token} />} />
      <Route path=":id" element={<FreelancerDetailPage apiUrl={apiUrl} token={token} />} />
      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  );
}
